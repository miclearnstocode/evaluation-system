import Image from "next/image";

export default function AuthBuilding() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-45 mix-blend-multiply sm:opacity-65"
      aria-hidden="true"
    >
      <Image
        src="/building.png"
        alt=""
        width={1920}
        height={1080}
        sizes="(min-width: 1261px) 66vw, (min-width: 640px) 832px, 608px"
        className="absolute top-[clamp(4rem,17dvh,12rem)] -right-36 h-auto w-[38rem] max-w-none sm:-right-32 sm:w-[max(52rem,66vw)]"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 20%, black 88%, transparent), linear-gradient(to bottom, transparent, black 9%, black 77%, transparent)",
          maskComposite: "intersect",
        }}
      />
      <Image
        src="/builder.png"
        alt=""
        width={447}
        height={558}
        sizes="(min-width: 1600px) 432px, (min-width: 640px) max(304px, 27vw), 240px"
        className="absolute top-24 -left-24 h-auto w-60 max-w-none opacity-60 sm:top-[clamp(7rem,22dvh,14rem)] sm:left-[clamp(-7rem,calc((100vw-106rem)/2),3rem)] sm:w-[clamp(19rem,27vw,27rem)] sm:opacity-75 2xl:opacity-90"
        style={{ maskImage: "linear-gradient(to bottom, black 72%, transparent)" }}
      />
    </div>
  );
}
