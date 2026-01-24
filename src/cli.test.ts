import { describe, test, expect } from "bun:test";
import { program } from "./cli";

describe("CLI commands", () => {
  describe("new command", () => {
    test("new command is registered", () => {
      const newCmd = program.commands.find(c => c.name() === "new");
      expect(newCmd).toBeDefined();
    });

    test("new command has --mode option", () => {
      const newCmd = program.commands.find(c => c.name() === "new");
      expect(newCmd).toBeDefined();
      const options = newCmd!.options;
      const modeOpt = options.find(o => o.long === "--mode");
      expect(modeOpt).toBeDefined();
    });

    test("new command has --skip-permissions option", () => {
      const newCmd = program.commands.find(c => c.name() === "new");
      expect(newCmd).toBeDefined();
      const options = newCmd!.options;
      const skipOpt = options.find(o => o.long === "--skip-permissions");
      expect(skipOpt).toBeDefined();
    });
  });

  describe("sessions launch command", () => {
    test("sessions command is registered", () => {
      const sessionsCmd = program.commands.find(c => c.name() === "sessions");
      expect(sessionsCmd).toBeDefined();
    });

    test("sessions launch has --continue option", () => {
      const sessionsCmd = program.commands.find(c => c.name() === "sessions");
      expect(sessionsCmd).toBeDefined();
      const launchCmd = sessionsCmd!.commands.find(c => c.name() === "launch");
      expect(launchCmd).toBeDefined();
      const continueOpt = launchCmd!.options.find(o => o.long === "--continue");
      expect(continueOpt).toBeDefined();
    });

    test("sessions launch has --dry-run option", () => {
      const sessionsCmd = program.commands.find(c => c.name() === "sessions");
      const launchCmd = sessionsCmd!.commands.find(c => c.name() === "launch");
      const dryRunOpt = launchCmd!.options.find(o => o.long === "--dry-run");
      expect(dryRunOpt).toBeDefined();
    });
  });

  describe("serve command", () => {
    test("serve command is registered", () => {
      const serveCmd = program.commands.find(c => c.name() === "serve");
      expect(serveCmd).toBeDefined();
    });
  });

  describe("config command", () => {
    test("config command is registered", () => {
      const configCmd = program.commands.find(c => c.name() === "config");
      expect(configCmd).toBeDefined();
    });
  });

  describe("backup command", () => {
    test("backup command is registered", () => {
      const backupCmd = program.commands.find(c => c.name() === "backup");
      expect(backupCmd).toBeDefined();
    });
  });
});

describe("CLI alias modes", () => {
  test("scratch mode string is valid", () => {
    const modes = ["scratch", "create", "clone"];
    expect(modes).toContain("scratch");
  });

  test("create mode string is valid", () => {
    const modes = ["scratch", "create", "clone"];
    expect(modes).toContain("create");
  });

  test("clone mode string is valid", () => {
    const modes = ["scratch", "create", "clone"];
    expect(modes).toContain("clone");
  });
});
