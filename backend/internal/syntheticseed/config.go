package syntheticseed

import "strings"

const DefaultPassword = "demo123"

type Account struct {
	Email    string
	Password string
	Name     string
	Role     string
}

type Config struct {
	Subject  string
	Teacher  Account
	Students []Account
	Seed     int64
}

func Enabled(raw string) bool {
	return !strings.EqualFold(strings.TrimSpace(raw), "false")
}

func DefaultConfig() Config {
	return Config{
		Subject: "To\u00e1n l\u1edbp 4",
		Teacher: Account{
			Email: "synthetic.teacher@aurora.local", Password: DefaultPassword,
			Name: "Synthetic Teacher", Role: "teacher",
		},
		Students: []Account{
			{Email: "synthetic.student.a@aurora.local", Password: DefaultPassword, Name: "Nguy\u1ec5n V\u0103n A", Role: "student"},
			{Email: "synthetic.student.b@aurora.local", Password: DefaultPassword, Name: "Tr\u1ea7n Th\u1ecb B", Role: "student"},
			{Email: "synthetic.student.c@aurora.local", Password: DefaultPassword, Name: "Ph\u1ea1m V\u0103n C", Role: "student"},
		},
		Seed: 20260718,
	}
}
