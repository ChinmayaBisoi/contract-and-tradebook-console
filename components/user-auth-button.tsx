import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Button } from './ui/button';
import Link from "next/link";

function UserAuthButton({ showDashboard = false }: { showDashboard?: boolean }) {
    return (
        <>
            <Show when="signed-out">
                <SignInButton>
                    <Button>Sign in</Button>
                </SignInButton>
            </Show>

            {showDashboard ? (
                <Show when="signed-in">
                    <Link href="/dashboard">
                        <Button>Dashboard</Button>
                    </Link>
                </Show>
            ) : <Show when="signed-in">
                <UserButton />
            </Show>}
        </>
    )
}

export default UserAuthButton