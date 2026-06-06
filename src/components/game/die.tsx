const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({ value, rolling = false }: { value: number; rolling?: boolean }) {
  return (
    <div className={`die ${rolling ? "die-rolling" : ""}`} aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={PIPS[value].includes(index) ? "die-pip" : ""} />
      ))}
    </div>
  );
}
