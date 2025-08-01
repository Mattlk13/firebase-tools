import * as clc from "colorette";

import { Command } from "../command";
import { logger } from "../logger";
import { configstore } from "../configstore";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import * as auth from "../auth";
import { isCloudEnvironment } from "../utils";
import { User, Tokens } from "../types/auth";

export const command = new Command("login")
  .description("log the CLI into Firebase")
  .option("--no-localhost", "login from a device without an accessible localhost")
  .option("--reauth", "force reauthentication even if already logged in")
  .action(async (options: any) => {
    if (options.nonInteractive) {
      throw new FirebaseError(
        "Cannot run login in non-interactive mode. See " +
          clc.bold("login:ci") +
          " to generate a token for use in non-interactive environments.",
        { exit: 1 },
      );
    }

    const user = options.user as User | undefined;
    const tokens = options.tokens as Tokens | undefined;

    if (user && tokens?.refresh_token && !options.reauth) {
      logger.info("Already logged in as", clc.bold(user.email));
      return user;
    }

    if (!options.reauth) {
      utils.logBullet(
        "The Firebase CLI’s MCP server feature can optionally make use of Gemini in Firebase. " +
          "Learn more about Gemini in Firebase and how it uses your data: https://firebase.google.com/docs/gemini-in-firebase#how-gemini-in-firebase-uses-your-data",
      );
      const geminiUsage = await confirm("Enable Gemini in Firebase features?");
      configstore.set("gemini", geminiUsage);

      logger.info();
      utils.logBullet(
        "Firebase optionally collects CLI and Emulator Suite usage and error reporting information to help improve our products. Data is collected in accordance with Google's privacy policy (https://policies.google.com/privacy) and is not used to identify you.",
      );
      const collectUsage = await confirm(
        "Allow Firebase to collect CLI and Emulator Suite usage and error reporting information?",
      );
      configstore.set("usage", collectUsage);

      if (geminiUsage || collectUsage) {
        logger.info();
        utils.logBullet(
          "To change your preferences at any time, run `firebase logout` and `firebase login` again.",
        );
      }
    }

    // Default to using the authorization code flow when the end
    // user is within a cloud-based environment, and therefore,
    // the authorization callback couldn't redirect to localhost.
    const useLocalhost = isCloudEnvironment() ? false : options.localhost;

    const result = await auth.loginGoogle(useLocalhost, user?.email);
    configstore.set("user", result.user);
    configstore.set("tokens", result.tokens);
    // store login scopes in case mandatory scopes grow over time
    configstore.set("loginScopes", result.scopes);
    // remove old session token, if it exists
    configstore.delete("session");

    logger.info();
    if (typeof result.user !== "string") {
      utils.logSuccess("Success! Logged in as " + clc.bold(result.user.email));
    } else {
      // Shouldn't really happen, but the JWT library that parses our results may
      // return a string
      logger.debug(
        "Unexpected string for UserCredentials.user. Maybe an auth response JWT didn't parse right?",
      );
      utils.logSuccess("Success! Logged in");
    }

    return auth;
  });
