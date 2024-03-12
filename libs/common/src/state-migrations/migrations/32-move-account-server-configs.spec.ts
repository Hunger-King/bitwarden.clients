import { runMigrator } from "../migration-helper.spec";

import { AccountServerConfigMigrator } from "./32-move-account-server-configs";

describe("AccountServerConfigMigrator", () => {
  const migrator = new AccountServerConfigMigrator(31, 32);

  it("can migrate all data", async () => {
    const output = await runMigrator(migrator, {
      authenticatedAccounts: ["user1", "user2"],
      user1: {
        settings: {
          serverConfig: {
            config: "user1 server config",
          },
        },
      },
      user2: {
        settings: {
          serverConfig: {
            config: "user2 server config",
          },
        },
      },
    });

    expect(output).toEqual({
      authenticatedAccounts: ["user1", "user2"],

      user1: {
        settings: {},
      },
      user2: {
        settings: {},
      },
      user_user1_config_serverConfig: {
        config: "user1 server config",
      },
      user_user2_config_serverConfig: {
        config: "user2 server config",
      },
    });
  });

  it("handles missing parts", async () => {
    const output = await runMigrator(migrator, {
      authenticatedAccounts: ["user1", "user2"],
      user1: {
        settings: {
          serverConfig: {
            config: "user1 server config",
          },
        },
      },
      user2: null,
    });

    expect(output).toEqual({
      authenticatedAccounts: ["user1", "user2"],
      user1: {
        settings: {},
      },
      user2: null,
      user_user1_config_serverConfig: {
        config: "user1 server config",
      },
    });
  });
});
