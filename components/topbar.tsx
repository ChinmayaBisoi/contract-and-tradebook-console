import React from 'react'
import Logo from './logo'
import UserAuthButton from './signin'

function Topbar({ isLandingPage = false }: { isLandingPage?: boolean }) {
    return (
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
            <Logo />
            <nav
                aria-label="Primary navigation"
                className="flex items-center gap-5 text-sm font-medium text-zinc-600 sm:gap-7"
            >
                {isLandingPage && (
                    <a
                        href="#features"
                        className="hidden transition-colors hover:text-zinc-950 sm:inline"
                    >
                        Features
                    </a>
                )}
                <UserAuthButton showDashboard={isLandingPage} />
            </nav>
        </header>
    )
}

export default Topbar