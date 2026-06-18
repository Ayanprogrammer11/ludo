"use client";

type RouteLoadingProps = {
  eyebrow: string;
  title: string;
  detail?: string;
};

export function RouteLoading({ eyebrow, title, detail }: RouteLoadingProps) {
  return (
    <section className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {detail ? <p>{detail}</p> : null}
      </div>
      <div className="loading-lines" aria-hidden="true">
        <span />
        <span />
      </div>
    </section>
  );
}
