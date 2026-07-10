import { cn } from '@/lib/utils'
import { ClassValue } from 'clsx'

function ComingSoon({ className }: { className?: ClassValue }) {
    return (
        <span className={cn("text-xs text-muted-foreground", className)}>Coming Soon</span>
    )
}

export default ComingSoon