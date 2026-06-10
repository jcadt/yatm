package apis

import (
	"context"
	"fmt"

	"github.com/samuelncui/yatm/entity"
)

func (api *API) JobEditState(ctx context.Context, req *entity.JobEditStateRequest) (*entity.JobEditStateReply, error) {
	job, err := api.exe.GetJob(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	if job == nil {
		return nil, fmt.Errorf("trabajo no encontrado, id= %d", req.Id)
	}

	if job.Status == entity.JobStatus_PROCESSING {
		return nil, fmt.Errorf("el estado del trabajo 'PROCESSING' es inesperado")
	}
	if req.Status != nil {
		if *req.Status == entity.JobStatus_PROCESSING {
			return nil, fmt.Errorf("el estado destino del trabajo 'PROCESSING' es inesperado")
		}
		job.Status = *req.Status
	}

	job.State = req.State
	if _, err := api.exe.SaveJob(ctx, job); err != nil {
		return nil, fmt.Errorf("save job fail, %w", err)
	}

	executor, err := api.exe.GetJobExecutor(ctx, job.ID)
	if err != nil {
		return nil, fmt.Errorf("get job executor fail, %w", err)
	}

	if err := executor.Close(ctx); err != nil {
		return nil, fmt.Errorf("close job executor fail, %w", err)
	}

	return &entity.JobEditStateReply{}, nil
}
