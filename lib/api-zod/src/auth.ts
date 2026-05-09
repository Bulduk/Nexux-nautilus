import * as zod from "zod";

export const AuthUser = zod.object({
  id: zod.string(),
  email: zod.string().nullable().optional(),
  firstName: zod.string().nullable().optional(),
  lastName: zod.string().nullable().optional(),
  profileImageUrl: zod.string().nullable().optional(),
});
export type AuthUser = zod.infer<typeof AuthUser>;

export const GetCurrentAuthUserResponse = zod.object({
  user: AuthUser.nullable(),
});
export type GetCurrentAuthUserResponse = zod.infer<typeof GetCurrentAuthUserResponse>;

export const ExchangeMobileAuthorizationCodeBody = zod.object({
  code: zod.string(),
  code_verifier: zod.string(),
  redirect_uri: zod.string(),
  state: zod.string(),
  nonce: zod.string().nullable().optional(),
});
export type ExchangeMobileAuthorizationCodeBody = zod.infer<typeof ExchangeMobileAuthorizationCodeBody>;

export const ExchangeMobileAuthorizationCodeResponse = zod.object({
  token: zod.string(),
});
export type ExchangeMobileAuthorizationCodeResponse = zod.infer<typeof ExchangeMobileAuthorizationCodeResponse>;

export const LogoutMobileSessionResponse = zod.object({
  success: zod.boolean(),
});
export type LogoutMobileSessionResponse = zod.infer<typeof LogoutMobileSessionResponse>;
