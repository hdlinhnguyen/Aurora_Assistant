package telemetry

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestPseudonymIsStableAndDoesNotExposeUUID(t *testing.T) {
	actorID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	first := Pseudonym([]byte("01234567890123456789012345678901"), "v1", actorID)
	second := Pseudonym([]byte("01234567890123456789012345678901"), "v1", actorID)

	if first != second {
		t.Fatalf("pseudonym changed: %q != %q", first, second)
	}
	if strings.Contains(first, actorID.String()) || len(first) != 35 {
		t.Fatalf("unsafe pseudonym %q", first)
	}
}

func TestPseudonymChangesWhenKeyVersionChanges(t *testing.T) {
	actorID := uuid.New()
	first := Pseudonym([]byte("01234567890123456789012345678901"), "v1", actorID)
	second := Pseudonym([]byte("01234567890123456789012345678902"), "v2", actorID)
	if first == second {
		t.Fatal("different HMAC keys should not produce the same pseudonym")
	}
}
