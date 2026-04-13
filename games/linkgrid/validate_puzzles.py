from __future__ import annotations

from dataclasses import dataclass


TEMPLATE_SPECS = [
    {"tier": 1, "orientation": "vertical", "colorCount": 2, "variant": 0},
    {"tier": 1, "orientation": "vertical", "colorCount": 3, "variant": 0},
    {"tier": 1, "orientation": "vertical", "colorCount": 4, "variant": 0},
    {"tier": 1, "orientation": "horizontal", "colorCount": 2, "variant": 0},
    {"tier": 2, "orientation": "horizontal", "colorCount": 3, "variant": 0},
    {"tier": 2, "orientation": "horizontal", "colorCount": 4, "variant": 0},
    {"tier": 2, "orientation": "vertical", "colorCount": 3, "variant": 1, "flipRows": True},
    {"tier": 2, "orientation": "horizontal", "colorCount": 3, "variant": 1, "flipCols": True},
    {"tier": 3, "orientation": "vertical", "colorCount": 4, "variant": 1, "flipCols": True},
    {"tier": 3, "orientation": "horizontal", "colorCount": 4, "variant": 1, "flipRows": True},
    {"tier": 4, "orientation": "vertical", "colorCount": 5, "variant": 0},
    {"tier": 4, "orientation": "horizontal", "colorCount": 5, "variant": 0},
    {"tier": 4, "orientation": "vertical", "colorCount": 2, "variant": 1, "flipRows": True, "flipCols": True},
    {"tier": 4, "orientation": "horizontal", "colorCount": 2, "variant": 1, "flipRows": True, "flipCols": True},
    {"tier": 5, "orientation": "vertical", "colorCount": 3, "variant": 2, "flipCols": True, "reversePath": True},
    {"tier": 5, "orientation": "horizontal", "colorCount": 3, "variant": 2, "flipRows": True, "reversePath": True},
]


@dataclass
class Puzzle:
    id: str
    size: int
    tier: int
    endpoints: list[dict]
    solution: list[dict]


def make_bands(size: int, color_count: int, variant: int) -> list[int]:
    bands = [size // color_count] * color_count
    remainder = size % color_count

    for index in range(remainder):
        bands[(variant + index) % color_count] += 1

    if variant % 2 == 1:
        bands.reverse()

    return bands


def build_snake_path(size: int, orientation: str, start: int, span: int) -> list[tuple[int, int]]:
    path: list[tuple[int, int]] = []

    if orientation == "vertical":
        for offset in range(span):
            column = start + offset
            rows = range(size) if offset % 2 == 0 else range(size - 1, -1, -1)
            for row in rows:
                path.append((row, column))
        return path

    for offset in range(span):
        row = start + offset
        columns = range(size) if offset % 2 == 0 else range(size - 1, -1, -1)
        for column in columns:
            path.append((row, column))

    return path


def transform_path(path: list[tuple[int, int]], size: int, spec: dict) -> list[tuple[int, int]]:
    next_path = [
        (
            size - 1 - row if spec.get("flipRows") else row,
            size - 1 - column if spec.get("flipCols") else column,
        )
        for row, column in path
    ]

    if spec.get("reversePath"):
        next_path.reverse()

    return next_path


def build_puzzle(size: int, level_number: int, spec: dict) -> Puzzle:
    color_count = min(spec["colorCount"], size)
    bands = make_bands(size, color_count, spec.get("variant", 0))
    solution = []
    cursor = 0

    for color, span in enumerate(bands):
        raw_path = build_snake_path(size, spec["orientation"], cursor, span)
        path = transform_path(raw_path, size, spec)
        solution.append({"color": color, "path": path})
        cursor += span

    endpoints = [
        {"color": entry["color"], "a": entry["path"][0], "b": entry["path"][-1]}
        for entry in solution
    ]

    return Puzzle(
        id=f"{size}-{level_number}",
        size=size,
        tier=spec["tier"],
        endpoints=endpoints,
        solution=solution,
    )


def build_puzzle_set() -> dict[int, list[Puzzle]]:
    return {
        size: [build_puzzle(size, index + 1, spec) for index, spec in enumerate(TEMPLATE_SPECS)]
        for size in [5, 6, 7, 8, 9, 10]
    }


def is_orthogonal_step(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1


def validate_puzzle(puzzle: Puzzle) -> list[str]:
    errors: list[str] = []
    seen_cells: dict[tuple[int, int], int] = {}

    for entry in puzzle.solution:
        color = entry["color"]
        path = entry["path"]
        if len(path) < 2:
            errors.append(f"color {color} does not have a valid path")
            continue

        color_cells: set[tuple[int, int]] = set()
        for cell in path:
            row, column = cell
            if not (0 <= row < puzzle.size and 0 <= column < puzzle.size):
                errors.append(f"color {color} uses an out-of-bounds cell")
                continue

            if cell in color_cells:
                errors.append(f"color {color} revisits cell {cell}")
            color_cells.add(cell)

            if cell in seen_cells:
                errors.append(f"cell {cell} is reused by colors {seen_cells[cell]} and {color}")
            else:
                seen_cells[cell] = color

        for index in range(1, len(path)):
            if not is_orthogonal_step(path[index - 1], path[index]):
                errors.append(f"color {color} has a non-orthogonal step")

        puzzle_endpoint = next((item for item in puzzle.endpoints if item["color"] == color), None)
        if puzzle_endpoint is None:
            errors.append(f"missing endpoint definition for color {color}")
            continue

        endpoints_match = {
            puzzle_endpoint["a"],
            puzzle_endpoint["b"],
        } == {path[0], path[-1]}
        if not endpoints_match:
            errors.append(f"endpoint mismatch for color {color}")

    if len(seen_cells) != puzzle.size * puzzle.size:
        errors.append("puzzle does not cover all cells")

    return errors


def main() -> int:
    failures: list[tuple[str, list[str]]] = []
    puzzles = build_puzzle_set()

    for size, entries in puzzles.items():
        if len(entries) != 16:
            failures.append((f"size-{size}", [f"expected 16 puzzles, found {len(entries)}"]))
        for puzzle in entries:
            errors = validate_puzzle(puzzle)
            if errors:
                failures.append((puzzle.id, errors))

    if failures:
        print("Linkgrid puzzle validation failed.")
        for puzzle_id, errors in failures:
            print(f"- {puzzle_id}: {'; '.join(errors)}")
        return 1

    counts = {size: len(entries) for size, entries in puzzles.items()}
    print("Linkgrid puzzle validation passed.")
    print(counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())