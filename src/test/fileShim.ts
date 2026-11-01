// jsdom's File has no text() or arrayBuffer(); real browsers do. Import from a test that reads files.
const read = <T>(file: Blob, how: "readAsText" | "readAsArrayBuffer") =>
  new Promise<T>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error);
    reader[how](file);
  });

if (typeof Blob !== "undefined") {
  Blob.prototype.text ??= function (this: Blob) {
    return read<string>(this, "readAsText");
  };
  Blob.prototype.arrayBuffer ??= function (this: Blob) {
    return read<ArrayBuffer>(this, "readAsArrayBuffer");
  };
}

export {};
