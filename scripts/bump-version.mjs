import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const VALID_BUMP_TYPES = new Set(["build", "patch", "minor", "major"]);
const BUILD_LABEL = "build";

const bumpType = process.argv[2];

if (!VALID_BUMP_TYPES.has(bumpType)) {
	throw new Error(`Expected one of: ${Array.from(VALID_BUMP_TYPES).join(", ")}`);
}

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));

const previousVersion = packageJson.version;
const nextVersion = bumpVersion(previousVersion, bumpType);

packageJson.version = nextVersion;
packageLock.version = nextVersion;

if (packageLock.packages?.[""]) {
	packageLock.packages[""].version = nextVersion;
}

writeJson(packageJsonPath, packageJson);
writeJson(packageLockPath, packageLock);

console.log(`Updated version: ${previousVersion} -> ${nextVersion}`);

function bumpVersion(version, type) {
	const parsed = parseVersion(version);
	let { major, minor, patch, build } = parsed;

	switch (type) {
		case "major":
			major += 1;
			minor = 0;
			patch = 0;
			build = 0;
			break;
		case "minor":
			minor += 1;
			patch = 0;
			build = 0;
			break;
		case "patch":
			patch += 1;
			build = 0;
			break;
		case "build":
			build += 1;
			break;
		default:
			throw new Error(`Unsupported bump type: ${type}`);
	}

	return `${major}.${minor}.${patch}-${BUILD_LABEL}.${build}`;
}

function parseVersion(version) {
	const match = version.match(
		new RegExp(`^(\\d+)\\.(\\d+)\\.(\\d+)(?:-${BUILD_LABEL}\\.(\\d+))?$`)
	);

	if (!match) {
		throw new Error(
			`Unsupported version format: ${version}. Expected x.y.z or x.y.z-${BUILD_LABEL}.n`
		);
	}

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		build: Number(match[4] ?? 0)
	};
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${JSON.stringify(value, null, "\t")}\n`);
}
