import SkeletonPageLoader from "@/components/loaders/skelton-page-loader";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type React from "react";
import { Suspense } from "react";

async function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = await auth();

    if (!isAuthenticated) {
        redirect("/");
    }

    return (
        <div>
            {children}
        </div>
    );
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<SkeletonPageLoader />}>
            <ProtectedLayout>
                {children}
            </ProtectedLayout>
        </Suspense>
    )
}
