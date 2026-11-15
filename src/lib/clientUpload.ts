export async function uploadDocumentFile(file: File): Promise<{success:boolean;fileUrl?:string;error?:string}> {
 try {const form=new FormData();form.append('file',file);const res=await fetch('/api/upload',{method:'POST',body:form});const data=await res.json();return res.ok?data:{success:false,error:data.error||'Upload failed'};}
 catch {return {success:false,error:'Cannot reach the print server. Please retry.'};}
}
