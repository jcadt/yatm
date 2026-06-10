package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/samuelncui/yatm/executor"
	"github.com/sirupsen/logrus"
	"gopkg.in/yaml.v2"
)

type Config struct {
	Domain      string `yaml:"domain"`
	Listen      string `yaml:"listen"`
	DebugListen string `yaml:"debug_listen"`

	Database struct {
		Dialect string `yaml:"dialect"`
		DSN     string `yaml:"dsn"`
	} `yaml:"database"`

	Paths       executor.Paths   `yaml:"paths"`
	TapeDevices []string         `yaml:"tape_devices"`
	TapeCapacity int64           `yaml:"tape_capacity"`
	Scripts     executor.Scripts `yaml:"scripts"`
}

func GetConfig(path string) *Config {
	cf, err := os.Open(path)
	if err != nil {
		panic(fmt.Errorf("open config file failed, %w", err))
	}

	conf := new(Config)
	if err := yaml.NewDecoder(cf).Decode(conf); err != nil {
		panic(fmt.Errorf("decode config file failed, %w", err))
	}
	_ = cf.Close()

	// Resolve all relative paths against the config file directory
	configDir := filepath.Dir(path)
	conf.Database.DSN = resolveAbs(configDir, conf.Database.DSN)
	conf.Paths.Work = resolveAbs(configDir, conf.Paths.Work)
	conf.Paths.Source = resolveAbs(configDir, conf.Paths.Source)
	conf.Paths.Target = resolveAbs(configDir, conf.Paths.Target)
	conf.Scripts.Encrypt = resolveAbs(configDir, conf.Scripts.Encrypt)
	conf.Scripts.Mkfs = resolveAbs(configDir, conf.Scripts.Mkfs)
	conf.Scripts.Mount = resolveAbs(configDir, conf.Scripts.Mount)
	conf.Scripts.Umount = resolveAbs(configDir, conf.Scripts.Umount)
	conf.Scripts.ReadInfo = resolveAbs(configDir, conf.Scripts.ReadInfo)

	logrus.Infof("read config success, conf= '%+v'", conf)
	return conf
}

func resolveAbs(base, target string) string {
	if filepath.IsAbs(target) {
		return target
	}
	return filepath.Join(base, target)
}
