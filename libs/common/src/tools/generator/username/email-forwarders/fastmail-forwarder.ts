import { ApiService } from "../../../../abstractions/api.service";
import { I18nService } from "../../../../platform/abstractions/i18n.service";

import { ApiOptions, EmailPartOptions, Forwarder } from "./forwarder";

export class FastmailForwarder implements Forwarder {
  readonly serviceName: string;

  constructor(private apiService: ApiService, private i18nService: I18nService) {
    this.serviceName = i18nService.t("forwarder.serviceName.fastmail");
  }

  async generate(website: string | null, options: ApiOptions & EmailPartOptions): Promise<string> {
    if (!options.token || options.token === "") {
      const error = this.i18nService.t("forwarder.invalidToken", this.serviceName);
      throw error;
    }

    const accountId = await this.getAccountId(options);
    if (!accountId || accountId === "") {
      const error = this.i18nService.t("forwarder.noAccountId", this.serviceName);
      throw error;
    }

    const body = JSON.stringify({
      using: ["https://www.fastmail.com/dev/maskedemail", "urn:ietf:params:jmap:core"],
      methodCalls: [
        [
          "MaskedEmail/set",
          {
            accountId: accountId,
            create: {
              "new-masked-email": {
                state: "enabled",
                description: "",
                url: website,
                emailPrefix: options.prefix,
              },
            },
          },
          "0",
        ],
      ],
    });

    const requestInit: RequestInit = {
      redirect: "manual",
      cache: "no-store",
      method: "POST",
      headers: new Headers({
        Authorization: "Bearer " + options.token,
        "Content-Type": "application/json",
      }),
      body,
    };

    const url = "https://api.fastmail.com/jmap/api/";
    const request = new Request(url, requestInit);

    const response = await this.apiService.nativeFetch(request);
    if (response.status === 200) {
      const json = await response.json();
      if (
        json.methodResponses != null &&
        json.methodResponses.length > 0 &&
        json.methodResponses[0].length > 0
      ) {
        if (json.methodResponses[0][0] === "MaskedEmail/set") {
          if (json.methodResponses[0][1]?.created?.["new-masked-email"] != null) {
            return json.methodResponses[0][1]?.created?.["new-masked-email"]?.email;
          }
          if (json.methodResponses[0][1]?.notCreated?.["new-masked-email"] != null) {
            const errorDescription =
              json.methodResponses[0][1]?.notCreated?.["new-masked-email"]?.description;
            const error = this.i18nService.t("forwarder.error", this.serviceName, errorDescription);
            throw error;
          }
        } else if (json.methodResponses[0][0] === "error") {
          const errorDescription = json.methodResponses[0][1]?.description;
          const error = this.i18nService.t("forwarder.error", this.serviceName, errorDescription);
          throw error;
        }
      }
    } else if (response.status === 401 || response.status === 403) {
      const error = this.i18nService.t("forwarder.invalidToken", this.serviceName);
      throw error;
    } else {
      const error = this.i18nService.t("forwarder.unknownError", this.serviceName);
      throw error;
    }
  }

  private async getAccountId(options: ApiOptions): Promise<string> {
    const requestInit: RequestInit = {
      cache: "no-store",
      method: "GET",
      headers: new Headers({
        Authorization: "Bearer " + options.token,
      }),
    };
    const url = "https://api.fastmail.com/.well-known/jmap";
    const request = new Request(url, requestInit);
    const response = await this.apiService.nativeFetch(request);
    if (response.status === 200) {
      const json = await response.json();
      if (json.primaryAccounts != null) {
        return json.primaryAccounts["https://www.fastmail.com/dev/maskedemail"];
      }
    }
    return null;
  }
}
