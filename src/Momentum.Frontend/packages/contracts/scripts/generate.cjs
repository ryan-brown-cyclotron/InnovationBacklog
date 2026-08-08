const { execSync } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const repoRoot = path.resolve(__dirname, "../../../../../");
const contractsProject = path.resolve(repoRoot, "src/Momentum.Contracts");
const nugetPackages = path.join(os.homedir(), ".nuget", "packages");

const env = {
  ...process.env,
  NUGET_PACKAGES: nugetPackages,
  NUGET_HTTP_CACHE_PATH: path.join(nugetPackages, "..", "v3-cache"),
  NUGET_USER_SPECIFIC_PACKAGES_PATH: nugetPackages,
};

console.log(`Building C# contracts in ${contractsProject}...`);
execSync("dotnet build", { cwd: contractsProject, env, stdio: "inherit" });

console.log("Generating TypeScript contracts with TypeGen...");
execSync("dotnet typegen generate", { cwd: contractsProject, env, stdio: "inherit" });

console.log("Done.");
