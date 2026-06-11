package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/recovery"
	"github.com/improbable-eng/grpc-web/go/grpcweb"
	rotatelogs "github.com/lestrrat-go/file-rotatelogs"
	"github.com/rifflock/lfshook"
	"github.com/samuelncui/yatm/apis"
	"github.com/samuelncui/yatm/config"
	"github.com/samuelncui/yatm/entity"
	"github.com/samuelncui/yatm/executor"
	"github.com/samuelncui/yatm/library"
	"github.com/samuelncui/yatm/resource"
	"github.com/samuelncui/yatm/tools"
	"github.com/sirupsen/logrus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	configOpt = flag.String("config", "./config.yaml", "config file path")
)

func main() {
	logWriter, err := rotatelogs.New(
		"./run.log.%Y%m%d%H%M",
		rotatelogs.WithLinkName("./run.log"),
		rotatelogs.WithMaxAge(time.Duration(86400)*time.Second),
		rotatelogs.WithRotationTime(time.Duration(604800)*time.Second),
	)
	if err != nil {
		panic(err)
	}
	logrus.AddHook(lfshook.NewHook(
		lfshook.WriterMap{
			logrus.InfoLevel:  logWriter,
			logrus.ErrorLevel: logWriter,
		},
		&logrus.TextFormatter{},
	))

	flag.Parse()
	conf := config.GetConfig(*configOpt)

	if conf.DebugListen != "" {
		go tools.Wrap(context.Background(), func() { tools.NewDebugServer(conf.DebugListen) })
	}

	db, err := resource.NewDBConn(conf.Database.Dialect, conf.Database.DSN)
	if err != nil {
		panic(err)
	}

	lib := library.New(db)
	if err := lib.AutoMigrate(); err != nil {
		panic(err)
	}

	exe := executor.New(db, lib, conf.TapeDevices, conf.Paths, conf.Scripts, conf.TapeCapacity)
	if err := exe.AutoMigrate(); err != nil {
		panic(err)
	}

	grpcPanicRecoveryHandler := func(p any) (err error) {
		logrus.Infof("recovered from panic, %v, stack= %s", p, debug.Stack())
		return status.Errorf(codes.Internal, "%s", p)
	}
	s := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			recovery.UnaryServerInterceptor(recovery.WithRecoveryHandler(grpcPanicRecoveryHandler)),
		),
		grpc.ChainStreamInterceptor(
			recovery.StreamServerInterceptor(recovery.WithRecoveryHandler(grpcPanicRecoveryHandler)),
		),
	)
	api := apis.New(conf.Paths.Source, lib, exe)
	entity.RegisterServiceServer(s, api)

	mux := http.NewServeMux()

	grpcWebServer := grpcweb.WrapServer(s, grpcweb.WithOriginFunc(func(origin string) bool { return true }))
	mux.Handle("/services/", http.StripPrefix("/services/", grpcWebServer))
	mux.Handle("/files/", http.StripPrefix("/files", api.Uploader()))

	// SSE endpoint for real-time job updates
	mux.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		_, ch, unsubscribe := exe.GetEventBus().Subscribe()
		defer unsubscribe()

		// Send initial keepalive
		fmt.Fprintf(w, ": connected\n\n")
		flusher.Flush()

		for {
			select {
			case event, ok := <-ch:
				if !ok {
					return
				}
				data, _ := event.MarshalJSON()
				fmt.Fprintf(w, "data: %s\n\n", data)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})

	// Health check endpoint (for systemd, docker, load balancers)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		sqlDB, err := db.DB()
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintf(w, `{"status":"error","message":"db connection failed"}`)
			return
		}
		if err := sqlDB.Ping(); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintf(w, `{"status":"error","message":"db ping failed"}`)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"ok"}`)
	})

	// Collection management REST API
	mux.HandleFunc("/api/collections", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		switch r.Method {
		case "OPTIONS":
			w.WriteHeader(http.StatusOK)
		case "GET":
			cols, err := lib.ListCollections(r.Context())
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}
			data, _ := json.Marshal(cols)
			w.Write(data)
		case "POST":
			var body struct {
				Name        string `json:"name"`
				Description string `json:"description"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
				return
			}
			col, err := lib.CreateCollection(r.Context(), body.Name, body.Description)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}
			data, _ := json.Marshal(col)
			w.WriteHeader(http.StatusCreated)
			w.Write(data)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Single collection: DELETE, or sub-resources
	mux.HandleFunc("/api/collections/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Parse path: /api/collections/{id}[/tapes[/{tapeID}]][/files]
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/")
		if len(parts) < 1 || parts[0] == "" {
			http.Error(w, `{"error":"missing collection id"}`, http.StatusBadRequest)
			return
		}

		colID, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"invalid collection id: %s"}`, err.Error()), http.StatusBadRequest)
			return
		}

		// One endpoint handles multiple sub-resources
		if r.Method == "DELETE" && len(parts) == 1 {
			// DELETE /api/collections/{id}
			if err := lib.DeleteCollection(r.Context(), colID); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if len(parts) < 2 {
			http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
			return
		}

		switch parts[1] {
		case "tapes":
			if len(parts) == 2 {
				// GET/POST /api/collections/{id}/tapes
				if r.Method == "GET" {
					tapeIDs, err := lib.ListCollectionTapes(r.Context(), colID)
					if err != nil {
						http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
						return
					}
					tapes, err := lib.MGetTape(r.Context(), tapeIDs...)
					if err != nil {
						http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
						return
					}
					result := make([]*entity.Tape, 0, len(tapes))
					for _, id := range tapeIDs {
						if t, ok := tapes[id]; ok {
							// Convert library.Tape to entity.Tape
							result = append(result, &entity.Tape{
								Id:            t.ID,
								Barcode:       t.Barcode,
								Name:          t.Name,
								Encryption:    t.Encryption,
								CreateTime:    t.CreateTime.Unix(),
								CapacityBytes: t.CapacityBytes,
								WritenBytes:   t.WritenBytes,
							})
						}
					}
					data, _ := json.Marshal(result)
					w.Write(data)
					return
				}
				if r.Method == "POST" {
					var body struct {
						TapeID int64 `json:"tape_id"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
						return
					}
					if err := lib.AddTapeToCollection(r.Context(), colID, body.TapeID); err != nil {
						http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
						return
					}
					w.WriteHeader(http.StatusCreated)
					fmt.Fprintf(w, `{"status":"ok"}`)
					return
				}
			}
			if len(parts) == 3 && r.Method == "DELETE" {
				// DELETE /api/collections/{id}/tapes/{tapeID}
				tapeID, err := strconv.ParseInt(parts[2], 10, 64)
				if err != nil {
					http.Error(w, fmt.Sprintf(`{"error":"invalid tape id: %s"}`, err.Error()), http.StatusBadRequest)
					return
				}
				if err := lib.RemoveTapeFromCollection(r.Context(), colID, tapeID); err != nil {
					http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
					return
				}
				w.WriteHeader(http.StatusNoContent)
				return
			}
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)

		case "files":
			// GET /api/collections/{id}/files?parent_id=X - list files in collection
			if r.Method != "GET" {
				http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
				return
			}
			parentIDStr := r.URL.Query().Get("parent_id")
			parentID := int64(0)
			if parentIDStr != "" {
				p, err := strconv.ParseInt(parentIDStr, 10, 64)
				if err != nil {
					http.Error(w, `{"error":"invalid parent_id"}`, http.StatusBadRequest)
					return
				}
				parentID = p
			}
			showHidden := r.URL.Query().Get("show_hidden") == "true"

			// Get tape IDs for this collection
			tapeIDs, err := lib.ListCollectionTapes(r.Context(), colID)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}

			result, err := lib.ListFilesInCollection(r.Context(), colID, parentID, tapeIDs, showHidden)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}
			data, _ := json.Marshal(result)
			w.Write(data)

		default:
			http.Error(w, `{"error":"unknown sub-resource"}`, http.StatusNotFound)
		}
	})

	fs := http.FileServer(http.Dir("./frontend/dist/assets"))
	mux.Handle("/assets/", http.StripPrefix("/assets/", fs))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		indexBuf, err := os.ReadFile("./frontend/dist/index.html")
		if err != nil {
			panic(err)
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(bytes.ReplaceAll(indexBuf, []byte("%%API_BASE%%"), []byte(fmt.Sprintf("%s/services", conf.Domain))))
	})

	srv := &http.Server{
		Handler: mux,
		Addr:    conf.Listen,
	}

	go func() {
		<-tools.ShutdownContext.Done()
		logrus.Infof("Graceful shutdown, wait for working process")
		start := time.Now()
		tools.Wait()
		logrus.Infof("Graceful shutdown, wait done, duration= %s", time.Since(start))
		srv.Shutdown(context.Background())
	}()

	log.Printf("http server listening at %v", srv.Addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
