import { Loader2Icon } from "lucide-react";

function SkeletonPageLoader() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <Loader2Icon className="h-10 w-10 animate-spin text-primary" />
    </div>
  );
}

export default SkeletonPageLoader;
