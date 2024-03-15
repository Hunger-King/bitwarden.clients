import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import {
  AssertCredentialParams,
  AssertCredentialResult,
  CreateCredentialParams,
  CreateCredentialResult,
  Fido2ClientService,
} from "@bitwarden/common/vault/abstractions/fido2/fido2-client.service.abstraction";
import { VaultSettingsService } from "@bitwarden/common/vault/abstractions/vault-settings/vault-settings.service";

import { BrowserApi } from "../../../platform/browser/browser-api";
import { AbortManager } from "../../background/abort-manager";
import { Fido2ContentScript, Fido2ContentScriptId } from "../enums/fido2-content-script.enum";
import { Fido2PortName } from "../enums/fido2-port-name.enum";

import {
  Fido2Background as Fido2BackgroundInterface,
  Fido2BackgroundExtensionMessageHandlers,
  Fido2ExtensionMessage,
  SharedFido2ScriptInjectionDetails,
  SharedFido2ScriptRegistrationOptions,
} from "./abstractions/fido2.background";

export default class Fido2Background implements Fido2BackgroundInterface {
  private abortManager = new AbortManager();
  private fido2ContentScriptPortsSet = new Set<chrome.runtime.Port>();
  private currentEnablePasskeysSetting: boolean;
  private registeredContentScripts: browser.contentScripts.RegisteredContentScript;
  private readonly sharedInjectionDetails: SharedFido2ScriptInjectionDetails = {
    allFrames: true,
    runAt: "document_start",
  };
  private readonly sharedRegistrationOptions: SharedFido2ScriptRegistrationOptions = {
    matches: ["https://*/*"],
    excludeMatches: ["https://*/*.xml*"],
    ...this.sharedInjectionDetails,
  };
  private readonly extensionMessageHandlers: Fido2BackgroundExtensionMessageHandlers = {
    fido2AbortRequest: ({ message }) => this.abortRequest(message),
    fido2RegisterCredentialRequest: ({ message, sender }) =>
      this.registerCredentialRequest(message, sender),
    fido2GetCredentialRequest: ({ message, sender }) => this.getCredentialRequest(message, sender),
  };

  constructor(
    private logService: LogService,
    private fido2ClientService: Fido2ClientService,
    private vaultSettingsService: VaultSettingsService,
  ) {}

  /**
   * Initializes the FIDO2 background service. Sets up the extension message
   * and port listeners. Subscribes to the enablePasskeys$ observable to
   * handle passkey enable/disable events.
   */
  init() {
    BrowserApi.messageListener("fido2.background", this.handleExtensionMessage);
    BrowserApi.addListener(chrome.runtime.onConnect, this.handleInjectedScriptPortConnection);
    this.vaultSettingsService.enablePasskeys$.subscribe(this.handleEnablePasskeysUpdate.bind(this));
  }

  /**
   * Injects the FIDO2 content and page script into all existing browser tabs.
   */
  async injectFido2ContentScriptsInAllTabs() {
    const tabs = await BrowserApi.tabsQuery({});
    for (let index = 0; index < tabs.length; index++) {
      const tab = tabs[index];
      if (!tab.url?.startsWith("https")) {
        continue;
      }

      void this.injectFido2ContentScripts(tab);
    }
  }

  /**
   * Handles reacting to the enablePasskeys setting being updated. If the setting
   * is enabled, the FIDO2 content scripts are injected into all tabs. If the setting
   * is disabled, the FIDO2 content scripts will be from all tabs. This logic will
   * not trigger until after the first setting update.
   *
   * @param enablePasskeys - The new value of the enablePasskeys setting.
   */
  private async handleEnablePasskeysUpdate(enablePasskeys: boolean) {
    const previousEnablePasskeysSetting = this.currentEnablePasskeysSetting;
    this.currentEnablePasskeysSetting = enablePasskeys;
    await this.updateContentScriptRegistration();

    if (typeof previousEnablePasskeysSetting === "undefined") {
      return;
    }

    this.destroyLoadedFido2ContentScripts();
    if (enablePasskeys) {
      void this.injectFido2ContentScriptsInAllTabs();
    }
  }

  /**
   * Updates the registration status of static FIDO2 content
   * scripts based on the enablePasskeys setting.
   */
  private async updateContentScriptRegistration() {
    if (BrowserApi.isManifestVersion(2)) {
      await this.updateMv2ContentScriptsRegistration();

      return;
    }

    await this.updateMv3ContentScriptsRegistration();
  }

  /**
   * Updates the registration status of static FIDO2 content
   * scripts based on the enablePasskeys setting for manifest v2.
   */
  private async updateMv2ContentScriptsRegistration() {
    if (!this.currentEnablePasskeysSetting) {
      await this.registeredContentScripts?.unregister();

      return;
    }

    this.registeredContentScripts = await BrowserApi.registerContentScriptsMv2({
      js: [
        { file: Fido2ContentScript.PageScriptAppend },
        { file: Fido2ContentScript.ContentScript },
      ],
      ...this.sharedRegistrationOptions,
    });
  }

  /**
   * Updates the registration status of static FIDO2 content
   * scripts based on the enablePasskeys setting for manifest v3.
   */
  private async updateMv3ContentScriptsRegistration() {
    if (this.currentEnablePasskeysSetting) {
      void BrowserApi.registerContentScriptsMv3([
        {
          id: Fido2ContentScriptId.PageScript,
          js: [Fido2ContentScript.PageScript],
          world: "MAIN",
          ...this.sharedRegistrationOptions,
        },
        {
          id: Fido2ContentScriptId.ContentScript,
          js: [Fido2ContentScript.ContentScript],
          ...this.sharedRegistrationOptions,
        },
      ]);

      return;
    }

    void BrowserApi.unregisterContentScriptsMv3({
      ids: [Fido2ContentScriptId.PageScript, Fido2ContentScriptId.ContentScript],
    });
  }

  /**
   * Injects the FIDO2 content and page script into the current tab.
   *
   * @param tab - The current tab to inject the scripts into.
   */
  private async injectFido2ContentScripts(tab: chrome.tabs.Tab): Promise<void> {
    this.injectFido2PageScript(tab);
    void BrowserApi.executeScriptInTab(tab.id, {
      file: Fido2ContentScript.ContentScript,
      ...this.sharedInjectionDetails,
    });
  }

  /**
   * Injects the FIDO2 page script into the current tab.
   *
   * @param tab - The current tab to inject the script into.
   */
  private injectFido2PageScript(tab: chrome.tabs.Tab) {
    if (BrowserApi.isManifestVersion(3)) {
      void BrowserApi.executeScriptInTab(
        tab.id,
        { file: Fido2ContentScript.PageScript, ...this.sharedInjectionDetails },
        { world: "MAIN" },
      );
      return;
    }

    void BrowserApi.executeScriptInTab(tab.id, {
      file: Fido2ContentScript.PageScriptAppend,
      ...this.sharedInjectionDetails,
    });
  }

  /**
   * Iterates over the set of injected FIDO2 content script ports
   * and disconnects them, destroying the content scripts.
   */
  private destroyLoadedFido2ContentScripts() {
    this.fido2ContentScriptPortsSet.forEach((port) => {
      port.disconnect();
      this.fido2ContentScriptPortsSet.delete(port);
    });
  }

  /**
   * Aborts the FIDO2 request with the provided requestId.
   *
   * @param message - The FIDO2 extension message containing the requestId to abort.
   */
  private abortRequest(message: Fido2ExtensionMessage) {
    this.abortManager.abort(message.abortedRequestId);
  }

  /**
   * Registers a new FIDO2 credential with the provided request data.
   *
   * @param message - The FIDO2 extension message containing the request data.
   * @param sender - The sender of the message.
   */
  private async registerCredentialRequest(
    message: Fido2ExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ): Promise<CreateCredentialResult> {
    return await this.handleCredentialRequest<CreateCredentialResult>(
      message,
      sender.tab,
      this.fido2ClientService.createCredential.bind(this.fido2ClientService),
    );
  }

  /**
   * Gets a FIDO2 credential with the provided request data.
   *
   * @param message - The FIDO2 extension message containing the request data.
   * @param sender - The sender of the message.
   */
  private async getCredentialRequest(
    message: Fido2ExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ): Promise<AssertCredentialResult> {
    return await this.handleCredentialRequest<AssertCredentialResult>(
      message,
      sender.tab,
      this.fido2ClientService.assertCredential.bind(this.fido2ClientService),
    );
  }

  /**
   * Handles Fido2 credential requests by calling the provided callback with the
   * request data, tab, and abort controller. The callback is expected to return
   * a promise that resolves with the result of the credential request.
   *
   * @param requestId - The request ID associated with the request.
   * @param data - The request data to handle.
   * @param tab - The tab associated with the request.
   * @param callback - The callback to call with the request data, tab, and abort controller.
   */
  private handleCredentialRequest = async <T>(
    { requestId, data }: Fido2ExtensionMessage,
    tab: chrome.tabs.Tab,
    callback: (
      data: AssertCredentialParams | CreateCredentialParams,
      tab: chrome.tabs.Tab,
      abortController: AbortController,
    ) => Promise<T>,
  ) => {
    return await this.abortManager.runWithAbortController(requestId, async (abortController) => {
      try {
        return await callback(data, tab, abortController);
      } finally {
        await BrowserApi.focusTab(tab.id);
        await BrowserApi.focusWindow(tab.windowId);
      }
    });
  };

  /**
   * Handles the FIDO2 extension message by calling the
   * appropriate handler based on the message command.
   *
   * @param message - The FIDO2 extension message to handle.
   * @param sender - The sender of the message.
   * @param sendResponse - The function to call with the response.
   */
  private handleExtensionMessage = (
    message: Fido2ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => {
    const handler: CallableFunction | undefined = this.extensionMessageHandlers[message?.command];
    if (!handler) {
      return;
    }

    const messageResponse = handler({ message, sender });
    if (!messageResponse) {
      return;
    }

    Promise.resolve(messageResponse)
      .then(
        (response) => sendResponse(response),
        (error) => sendResponse({ error: { ...error, message: error.message } }),
      )
      .catch(this.logService.error);

    return true;
  };

  /**
   * Handles the connection of a FIDO2 content script port by checking if the
   * FIDO2 feature is enabled for the sender's hostname and origin. If the feature
   * is not enabled, the port is disconnected.
   *
   * @param port - The port which is connecting
   */
  private handleInjectedScriptPortConnection = async (port: chrome.runtime.Port) => {
    if (port.name !== Fido2PortName.InjectedScript || !port.sender?.url) {
      return;
    }

    try {
      const { hostname, origin } = new URL(port.sender.url);
      if (!(await this.fido2ClientService.isFido2FeatureEnabled(hostname, origin))) {
        port.disconnect();
        return;
      }

      this.fido2ContentScriptPortsSet.add(port);
      port.onDisconnect.addListener(this.handleInjectScriptPortOnDisconnect);
    } catch (error) {
      this.logService.error(error);
      port.disconnect();
    }
  };

  /**
   * Handles the disconnection of a FIDO2 content script port
   * by removing it from the set of connected ports.
   *
   * @param port - The port which is disconnecting
   */
  private handleInjectScriptPortOnDisconnect = (port: chrome.runtime.Port) => {
    if (port.name !== Fido2PortName.InjectedScript) {
      return;
    }

    this.fido2ContentScriptPortsSet.delete(port);
  };
}
