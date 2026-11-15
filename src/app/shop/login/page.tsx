import {redirect} from 'next/navigation';
import {isLocalMode} from '@/lib/access';
import StaffLogin from '@/components/StaffLogin';
export const dynamic='force-dynamic';
export default function Page(){if(isLocalMode())redirect('/shop');return <StaffLogin admin={false}/>;}
