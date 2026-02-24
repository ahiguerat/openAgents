import path from "node:path";

export function resolveSandboxPath(sandboxRoot: string, inputPath: string): string {
  const normalizedRoot = path.resolve(sandboxRoot);
  const candidate = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(normalizedRoot, inputPath);

  if (!isInside(normalizedRoot, candidate)) {
    throw new Error(`Path is outside sandbox: ${inputPath}`);
  }

  return candidate;
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const normalizedRoot = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
  return candidatePath === rootPath || candidatePath.startsWith(normalizedRoot);
}
