import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { HintComponent as BaseHintComponent } from "@bitwarden/angular/auth/components/hint.component";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { LoginEmailService } from "@bitwarden/common/auth/abstractions/login-email.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";

@Component({
  selector: "app-hint",
  templateUrl: "hint.component.html",
})
export class HintComponent extends BaseHintComponent {
  constructor(
    router: Router,
    i18nService: I18nService,
    apiService: ApiService,
    platformUtilsService: PlatformUtilsService,
    logService: LogService,
    loginEmailService: LoginEmailService,
  ) {
    super(router, i18nService, apiService, platformUtilsService, logService, loginEmailService);
  }
}
