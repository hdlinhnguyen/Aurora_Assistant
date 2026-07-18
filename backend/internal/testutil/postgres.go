package testutil

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const examTestDatabase = "aurora_exam_test"

var schemaNamePattern = regexp.MustCompile(`^exam_test_[a-f0-9]{32}$`)

// OpenPostgres opens a connection whose search path is an isolated schema.
// The schema and its contents are removed automatically when the test ends.
func OpenPostgres(t *testing.T) *gorm.DB {
	t.Helper()

	host := envOrDefault("DB_HOST", "localhost")
	user := envOrDefault("DB_USER", "aurora")
	password := envOrDefault("DB_PASSWORD", "password123")
	port := envOrDefault("DB_PORT", "5434")
	sslmode := envOrDefault("DB_SSLMODE", "disable")

	adminDB := openDatabase(t, host, user, password, "postgres", port, sslmode, "")
	var exists bool
	if err := adminDB.Raw(
		"SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ?)",
		examTestDatabase,
	).Scan(&exists).Error; err != nil {
		closeDatabase(t, adminDB)
		t.Fatalf("check test database: %v", err)
	}
	if !exists {
		if err := adminDB.Exec(`CREATE DATABASE "aurora_exam_test"`).Error; err != nil {
			closeDatabase(t, adminDB)
			t.Fatalf("create test database: %v", err)
		}
	}
	closeDatabase(t, adminDB)

	setupDB := openDatabase(t, host, user, password, examTestDatabase, port, sslmode, "")
	if err := setupDB.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).Error; err != nil {
		closeDatabase(t, setupDB)
		t.Fatalf("create uuid-ossp extension: %v", err)
	}

	schemaName := "exam_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if !schemaNamePattern.MatchString(schemaName) {
		closeDatabase(t, setupDB)
		t.Fatalf("invalid generated schema name %q", schemaName)
	}
	if err := setupDB.Exec(fmt.Sprintf(`CREATE SCHEMA "%s"`, schemaName)).Error; err != nil {
		closeDatabase(t, setupDB)
		t.Fatalf("create test schema: %v", err)
	}

	var testDB *gorm.DB
	t.Cleanup(func() {
		cleanupPostgresSchema(t, setupDB, testDB, schemaName)
	})
	testDB = openDatabase(t, host, user, password, examTestDatabase, port, sslmode, schemaName+",public")

	return testDB
}

func cleanupPostgresSchema(t *testing.T, setupDB, testDB *gorm.DB, schemaName string) {
	t.Helper()

	if testDB != nil {
		closeDatabase(t, testDB)
	}
	if err := setupDB.Exec(fmt.Sprintf(`DROP SCHEMA "%s" CASCADE`, schemaName)).Error; err != nil {
		t.Errorf("drop test schema: %v", err)
	}
	closeDatabase(t, setupDB)
}

func openDatabase(
	t *testing.T,
	host, user, password, dbname, port, sslmode, searchPath string,
) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		host, user, password, dbname, port, sslmode,
	)
	if searchPath != "" {
		dsn += " search_path=" + searchPath
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open PostgreSQL database %s: %v", dbname, err)
	}
	return db
}

func closeDatabase(t *testing.T, db *gorm.DB) {
	t.Helper()

	sqlDB, err := db.DB()
	if err != nil {
		t.Errorf("get PostgreSQL pool: %v", err)
		return
	}
	if err := sqlDB.Close(); err != nil {
		t.Errorf("close PostgreSQL pool: %v", err)
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
