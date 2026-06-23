import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const zipPath = path.join(rootDir, "clc-extension.zip");

if (!existsSync(distDir)) {
	throw new Error(`Build output folder not found: ${distDir}`);
}

const archiveCommand = [
	"$ErrorActionPreference = 'Stop'",
	`$distPath = '${distDir.replace(/'/g, "''")}'`,
	`$zipPath = '${zipPath.replace(/'/g, "''")}'`,
	"if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }",
	"Compress-Archive -LiteralPath $distPath -DestinationPath $zipPath -Force"
].join("; ");

execFileSync(
	"powershell",
	["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", archiveCommand],
	{ stdio: "inherit" }
);

console.log(`Created ${zipPath}`);
