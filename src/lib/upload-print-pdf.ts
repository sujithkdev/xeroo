export async function uploadPrintPdf(file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/upload', {method:'POST', body:form});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not upload ' + file.name);
  return {fileUrl:data.fileUrl, fileName:data.fileName || file.name, pages:data.pages, copies:1,
    paperSize:'A4', colorMode:'bw', duplex:'simplex', orientation:'portrait', pageRange:'', finishing:'none'};
}
