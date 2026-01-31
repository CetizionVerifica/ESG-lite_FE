import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  message: string;
}

/**
 * Request a password reset email
 */
export const forgotPassword = async (email: string): Promise<ForgotPasswordResponse> => {
  const response = await axios.post(`${API_URL}/forgot-password`, { email });
  return response.data;
};

/**
 * Reset password using the token from email
 */
export const resetPassword = async (token: string, password: string): Promise<ResetPasswordResponse> => {
  const response = await axios.post(`${API_URL}/reset-password`, { token, password });
  return response.data;
};

/**
 * Verify if a reset token is still valid
 */
export const verifyResetToken = async (token: string): Promise<VerifyTokenResponse> => {
  const response = await axios.get(`${API_URL}/verify-reset-token/${token}`);
  return response.data;
};
