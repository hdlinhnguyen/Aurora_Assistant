package telemetry

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"

	"github.com/google/uuid"
)

func Pseudonym(key []byte, keyVersion string, actorID uuid.UUID) string {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(actorID.String()))
	digest := hex.EncodeToString(mac.Sum(nil))
	return keyVersion + "_" + digest[:32]
}
