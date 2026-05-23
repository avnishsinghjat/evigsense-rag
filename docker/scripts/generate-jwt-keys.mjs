#!/usr/bin/env node
/**
 * Generate ANON_KEY and SERVICE_ROLE_KEY for a given JWT_SECRET (matches supabase generate-keys.sh).
 * Usage: node generate-jwt-keys.mjs [JWT_SECRET]
 */
import crypto from "node:crypto";

const jwtSecret = process.argv[2] ?? process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("Usage: node generate-jwt-keys.mjs <JWT_SECRET>");
  process.exit(1);
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function genToken(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signed = `${header}.${body}`;
  const signature = crypto
    .createHmac("sha256", jwtSecret)
    .update(signed)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${signed}.${signature}`;
}

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 5 * 3600 * 24 * 365;

const anonKey = genToken({ role: "anon", iss: "supabase", iat, exp });
const serviceRoleKey = genToken({ role: "service_role", iss: "supabase", iat, exp });

console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ANON_KEY=${anonKey}`);
console.log(`SERVICE_ROLE_KEY=${serviceRoleKey}`);
