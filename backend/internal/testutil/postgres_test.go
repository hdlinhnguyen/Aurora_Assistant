package testutil

import (
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestCleanupPostgresSchemaWithoutTestConnection(t *testing.T) {
	_ = OpenPostgres(t)

	host := envOrDefault("DB_HOST", "localhost")
	user := envOrDefault("DB_USER", "aurora")
	password := envOrDefault("DB_PASSWORD", "password123")
	port := envOrDefault("DB_PORT", "5434")
	sslmode := envOrDefault("DB_SSLMODE", "disable")

	setupDB := openDatabase(t, host, user, password, examTestDatabase, port, sslmode, "")
	observerDB := openDatabase(t, host, user, password, examTestDatabase, port, sslmode, "")
	t.Cleanup(func() {
		closeDatabase(t, observerDB)
	})

	schemaName := "exam_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err := setupDB.Exec(fmt.Sprintf(`CREATE SCHEMA "%s"`, schemaName)).Error; err != nil {
		t.Fatal(err)
	}

	cleanupPostgresSchema(t, setupDB, nil, schemaName)

	var exists bool
	if err := observerDB.Raw(
		"SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ?)",
		schemaName,
	).Scan(&exists).Error; err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatalf("schema %s leaked after cleanup without a test connection", schemaName)
	}
}
