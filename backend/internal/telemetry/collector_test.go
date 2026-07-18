package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type recordingPublisher struct {
	events []Event
}

func (p *recordingPublisher) Publish(_ context.Context, event Event) (PublishResult, error) {
	for _, existing := range p.events {
		if existing.EventID == event.EventID {
			return PublishResult{Duplicate: true}, nil
		}
	}
	p.events = append(p.events, event)
	return PublishResult{}, nil
}

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }

func jsonBody(value any) io.Reader {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return bytes.NewReader(encoded)
}

func TestCollectorReplacesClientActorIdentity(t *testing.T) {
	publisher := &recordingPublisher{}
	actorID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	app := fiber.New()
	handler := NewCollector(publisher, []byte("01234567890123456789012345678901"), "v1", fixedClock{now: time.Date(2026, 7, 18, 3, 0, 1, 0, time.UTC)})
	app.Post("/telemetry/events", func(c fiber.Ctx) error {
		c.Locals("userID", actorID.String())
		c.Locals("user", &jwt.Token{Claims: jwt.MapClaims{"role": "student"}})
		return handler(c)
	})

	event := validEvent()
	event.ActorID = "client-controlled"
	request := httptest.NewRequest("POST", "/telemetry/events", jsonBody(Batch{Events: []Event{event}}))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusAccepted, response.StatusCode)
	require.Len(t, publisher.events, 1)
	require.Equal(t, Pseudonym([]byte("01234567890123456789012345678901"), "v1", actorID), publisher.events[0].ActorID)
	require.Equal(t, "student", publisher.events[0].ActorRole)
}

func TestCollectorReportsDuplicateWithoutWritingItTwice(t *testing.T) {
	publisher := &recordingPublisher{}
	actorID := uuid.New()
	handler := NewCollector(publisher, []byte("01234567890123456789012345678901"), "v1", fixedClock{now: time.Now().UTC()})
	app := fiber.New()
	app.Post("/telemetry/events", func(c fiber.Ctx) error {
		c.Locals("userID", actorID.String())
		c.Locals("user", &jwt.Token{Claims: jwt.MapClaims{"role": "student"}})
		return handler(c)
	})

	event := validEvent()
	firstRequest := httptest.NewRequest("POST", "/telemetry/events", jsonBody(Batch{Events: []Event{event}}))
	firstRequest.Header.Set("Content-Type", "application/json")
	first, err := app.Test(firstRequest)
	require.NoError(t, err)
	secondRequest := httptest.NewRequest("POST", "/telemetry/events", jsonBody(Batch{Events: []Event{event}}))
	secondRequest.Header.Set("Content-Type", "application/json")
	second, err := app.Test(secondRequest)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusAccepted, first.StatusCode)
	require.Equal(t, fiber.StatusAccepted, second.StatusCode)
	require.Len(t, publisher.events, 1)
}
