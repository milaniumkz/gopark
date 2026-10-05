import { Body, Controller, Post, Req, UnauthorizedException } from "@nestjs/common";
import type {
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  LogoutResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  RefreshRequest,
  TokenPair,
} from "@gopark/contracts";
import { AuthService } from "./auth.service.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import type { AuthRateLimitRequest } from "./auth-rate-limit.request.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  @Post("login")
  async login(@Req() request: AuthRateLimitRequest, @Body() body: LoginRequest): Promise<TokenPair> {
    await this.authRateLimitService.assertLoginAllowed(request, body.login);

    try {
      return await this.authService.login(body);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.authRateLimitService.registerLoginFailure(request, body.login);
      }

      throw error;
    }
  }

  @Post("refresh")
  async refresh(@Req() request: AuthRateLimitRequest, @Body() body: RefreshRequest): Promise<TokenPair> {
    await this.authRateLimitService.consumeRefreshAttempt(request);
    return this.authService.refresh(body);
  }

  @Post("change-password")
  async changePassword(
    @CurrentUser() currentUser: RequestUser | null,
    @Body() body: ChangePasswordRequest,
  ): Promise<TokenPair> {
    return this.authService.changePassword(currentUser, body);
  }

  @Post("password-reset-request")
  async requestPasswordReset(@Body() body: PasswordResetRequest): Promise<PasswordResetRequestResponse> {
    return this.authService.requestPasswordReset(body);
  }

  @Post("logout")
  async logout(@Req() request: AuthRateLimitRequest, @Body() body: LogoutRequest): Promise<LogoutResponse> {
    await this.authRateLimitService.consumeLogoutAttempt(request);
    return this.authService.logout(body);
  }
}
