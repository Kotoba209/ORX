export type ProjectFile = { path: string; kind: string; bytes: number };

export type FileTreeNode = {
  name: string;
  path: string;
  kind: "directory" | string;
  bytes: number;
  children: FileTreeNode[];
};

export function buildFileTree(files: ProjectFile[]) {
  const root: FileTreeNode = { name: "", path: "", kind: "directory", bytes: 0, children: [] };
  const directories = new Map<string, FileTreeNode>([["", root]]);

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      if (isFile) {
        parent.children.push({ name: part, path: file.path, kind: file.kind, bytes: file.bytes, children: [] });
        continue;
      }
      let directory = directories.get(currentPath);
      if (!directory) {
        directory = { name: part, path: currentPath, kind: "directory", bytes: 0, children: [] };
        directories.set(currentPath, directory);
        parent.children.push(directory);
      }
      parent = directory;
    }
  }

  sortTree(root);
  return root.children;
}

function sortTree(node: FileTreeNode) {
  node.children.sort((left, right) => {
    if (left.kind === "directory" && right.kind !== "directory") return -1;
    if (left.kind !== "directory" && right.kind === "directory") return 1;
    return left.name.localeCompare(right.name);
  });
  node.children.forEach(sortTree);
}
