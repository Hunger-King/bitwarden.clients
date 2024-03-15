import { Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { HintComponent as BaseHintComponent } from "@bitwarden/angular/auth/components/hint.component";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { EmailService } from "@bitwarden/common/auth/abstractions/email.service";
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
    platformUtilsService: PlatformUtilsService,
    i18nService: I18nService,
    apiService: ApiService,
    logService: LogService,
    private route: ActivatedRoute,
    emailService: EmailService,
  ) {
    super(router, i18nService, apiService, platformUtilsService, logService, emailService);

    super.onSuccessfulSubmit = async () => {
      // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.router.navigate([this.successRoute]);
    };
  }
}
