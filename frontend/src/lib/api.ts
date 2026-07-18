export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081/api";

type ApiOptions = RequestInit & {
  requireAuth?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly latestContext?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch(endpoint: string, options: ApiOptions = {}) {
  const { requireAuth = true, ...fetchOptions } = options;
  const headers = new Headers(options.headers || {});

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Add Auth Token securely
  if (requireAuth && typeof window !== 'undefined') {
    const token = localStorage.getItem("aurora_token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const maxRetries = fetchOptions.method === 'GET' ? 2 : 0;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...fetchOptions,
        headers,
      });

      if (!response.ok) {
        if (response.status === 401 && requireAuth && typeof window !== 'undefined') {
          localStorage.removeItem("aurora_token");
          localStorage.removeItem("aurora_user");
          window.location.href = "/";
        }
        
        if (response.status >= 500 && attempt < maxRetries) {
          throw new Error(`Server Error ${response.status}`);
        }

        const errorData = await response.json().catch(() => ({}));
        let rawError = "";
        
        if (typeof errorData.error === "string") {
          rawError = errorData.error;
        } else if (errorData.error && typeof errorData.error.message === "string") {
          rawError = errorData.error.message;
        } else if (typeof errorData.message === "string") {
          rawError = errorData.message;
        } else {
          rawError = `HTTP Error ${response.status}`;
        }
        
        // Auto-translate backend errors gracefully to Vietnamese
        if (typeof window !== 'undefined') {
          const viMap: Record<string, string> = {
            "Too many requests. Please try again later.": "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
            "Unauthorized": "Không có quyền truy cập",
            "Invalid email or password": "Email hoặc mật khẩu không chính xác",
            "email already exists": "Email này đã được đăng ký trước đó",
            "record not found": "Không tìm thấy dữ liệu yêu cầu."
          };
          for (const [enKey, viVal] of Object.entries(viMap)) {
            if (rawError.includes(enKey) || enKey.includes(rawError)) {
              rawError = viVal;
              break;
            }
          }
        }
        
        throw new ApiError(
          rawError,
          response.status,
          typeof errorData.error?.code === "string" ? errorData.error.code : undefined,
          errorData.error?.details,
          errorData.latestContext,
        );
      }

      if (response.status === 204) return null;
      return await response.json();
      
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries && (error.message.includes('Server Error') || error.message.includes('Failed to fetch'))) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
        continue;
      }
      if (typeof window !== 'undefined' && error.message.includes('Failed to fetch')) {
        error.message = "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.";
      }
      throw error;
    }
  }

  throw lastError;
}
