/**
 * Authentication module for claudectl serve
 * Uses bcrypt for password hashing and simple JWT-like tokens
 * Compatible with both Node.js and Bun
 */

import { randomBytes, createHmac } from "crypto";
import bcrypt from "bcrypt";
import { getClaudectlDir } from "../core/config";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";

interface ServerConfig {
  passwordHash?: string;
  jwtSecret?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  pushSubscriptions?: PushSubscription[];
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface TokenPayload {
  iat: number;
  exp: number;
}

const CONFIG_FILE = "server-config.json";
const TOKEN_EXPIRY_DAYS = 7;

function getConfigPath(): string {
  return join(getClaudectlDir(), CONFIG_FILE);
}

function loadConfig(): ServerConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: ServerConfig): void {
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2));
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Set the server password
 */
export async function setPassword(password: string): Promise<void> {
  const config = loadConfig();
  config.passwordHash = await hashPassword(password);

  // Generate JWT secret if not exists
  if (!config.jwtSecret) {
    config.jwtSecret = randomBytes(32).toString("hex");
  }

  saveConfig(config);
}

/**
 * Check if password is set
 */
export function isPasswordSet(): boolean {
  const config = loadConfig();
  return !!config.passwordHash;
}

/**
 * Authenticate with password and return a token
 */
export async function authenticate(password: string): Promise<string | null> {
  const config = loadConfig();

  if (!config.passwordHash) {
    return null;
  }

  const valid = await verifyPassword(password, config.passwordHash);
  if (!valid) {
    return null;
  }

  return generateToken();
}

/**
 * Generate a JWT-like token
 */
function generateToken(): string {
  const config = loadConfig();
  if (!config.jwtSecret) {
    throw new Error("JWT secret not configured");
  }

  const payload: TokenPayload = {
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.jwtSecret)
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

/**
 * Verify a token
 */
export function verifyToken(token: string): boolean {
  const config = loadConfig();
  if (!config.jwtSecret) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payloadBase64, signature] = parts;

  // Verify signature
  const expectedSignature = createHmac("sha256", config.jwtSecret)
    .update(payloadBase64)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return false;
  }

  // Check expiry
  try {
    const payload: TokenPayload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString()
    );

    if (payload.exp < Date.now()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get or generate VAPID keys for push notifications
 */
export function getVapidKeys(): { publicKey: string; privateKey: string } {
  const config = loadConfig();

  if (config.vapidPublicKey && config.vapidPrivateKey) {
    return {
      publicKey: config.vapidPublicKey,
      privateKey: config.vapidPrivateKey,
    };
  }

  // Generate new VAPID keys using web-push
  const webpush = require("web-push");
  const vapidKeys = webpush.generateVAPIDKeys();

  config.vapidPublicKey = vapidKeys.publicKey;
  config.vapidPrivateKey = vapidKeys.privateKey;
  saveConfig(config);

  return vapidKeys;
}

/**
 * Save a push subscription
 */
export function savePushSubscription(subscription: PushSubscription): void {
  const config = loadConfig();
  if (!config.pushSubscriptions) {
    config.pushSubscriptions = [];
  }

  // Avoid duplicates
  const exists = config.pushSubscriptions.some(
    (s) => s.endpoint === subscription.endpoint
  );

  if (!exists) {
    config.pushSubscriptions.push(subscription);
    saveConfig(config);
  }
}

/**
 * Get all push subscriptions
 */
export function getPushSubscriptions(): PushSubscription[] {
  const config = loadConfig();
  return config.pushSubscriptions || [];
}

/**
 * Remove a push subscription
 */
export function removePushSubscription(endpoint: string): void {
  const config = loadConfig();
  if (config.pushSubscriptions) {
    config.pushSubscriptions = config.pushSubscriptions.filter(
      (s) => s.endpoint !== endpoint
    );
    saveConfig(config);
  }
}
