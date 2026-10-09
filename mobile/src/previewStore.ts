const previews = new Map<string, string>();

export const previewStore = {
  set(id: string, uri: string): void {
    previews.set(id, uri);
  },
  get(id: string): string | undefined {
    return previews.get(id);
  },
};
