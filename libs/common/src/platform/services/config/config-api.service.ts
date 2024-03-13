import { ApiService } from "../../../abstractions/api.service";
import { AuthService } from "../../../auth/abstractions/auth.service";
import { AuthenticationStatus } from "../../../auth/enums/authentication-status";
import { UserId } from "../../../types/guid";
import { ConfigApiServiceAbstraction } from "../../abstractions/config/config-api.service.abstraction";
import { ServerConfigResponse } from "../../models/response/server-config.response";

export class ConfigApiService implements ConfigApiServiceAbstraction {
  constructor(
    private apiService: ApiService,
    private authService: AuthService,
  ) {}

  async get(userId: UserId | undefined): Promise<ServerConfigResponse> {
    const authed: boolean =
      userId == null
        ? false
        : (await this.authService.getAuthStatus()) !== AuthenticationStatus.LoggedOut;

    const r = await this.apiService.send("GET", "/config", null, authed, true);
    return new ServerConfigResponse(r);
  }
}
