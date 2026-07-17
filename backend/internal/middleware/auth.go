package middleware

import (
	"fmt"
	"os"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	"backend/internal/model"
)

// Protected ensures that a valid JWT token is provided and the user actually exists in the DB
func Protected(db *gorm.DB) fiber.Handler {
	return func(c fiber.Ctx) error {
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Server configuration error. Contact administrator.",
			})
		}

		authHeader := c.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			// Fallback to checking cookies
			cookieToken := c.Cookies("aurora_token")
			if cookieToken == "" {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "Missing or invalid token",
				})
			}
			authHeader = "Bearer " + cookieToken
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// Parse the token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Unauthorized or expired token",
			})
		}

		c.Locals("user", token)

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if sub, exists := claims["sub"].(string); exists {
				var count int64
				if err := db.Model(&model.User{}).Where("id = ?", sub).Count(&count).Error; err != nil || count == 0 {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
						"error": "User account no longer exists. Please relogin.",
					})
				}
				c.Locals("userID", sub)
			} else {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "Invalid token signature subject.",
				})
			}
		}

		return c.Next()
	}
}
