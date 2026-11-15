import WorkspaceShell from '@/components/WorkspaceShell';
import {isLocalMode} from '@/lib/access';
export const dynamic='force-dynamic';
export default function Layout({children}:{children:React.ReactNode}){return <WorkspaceShell admin={true} localMode={isLocalMode()}>{children}</WorkspaceShell>}
