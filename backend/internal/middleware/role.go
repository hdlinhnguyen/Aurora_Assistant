package middleware

import (
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

func RequireRole(role string) fiber.Handler {
	return func(c fiber.Ctx) error {
		token, ok := c.Locals("user").(*jwt.Token)
		if !ok || token == nil {
			return roleError(c, fiber.StatusUnauthorized, "unauthorized", "Authentication is required.")
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["role"] != role {
			code := role + "_required"
			message := "The required role is missing."
			if role == "teacher" {
				message = "Teacher role is required."
			}
			return roleError(c, fiber.StatusForbidden, code, message)
		}
		return c.Next()
	}
}

func roleError(c fiber.Ctx, status int, code, message string) error {
	return c.Status(status).JSON(fiber.Map{
		"error": fiber.Map{"code": code, "message": message},
	})
}
