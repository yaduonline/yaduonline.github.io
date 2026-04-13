from __future__ import annotations

from dataclasses import dataclass


TEMPLATE_SPECS = [
    {"tier": 1, "style": "row-snake", "weights": [4, 6, 5, 4, 6], "variant": 0},
    {"tier": 1, "style": "column-snake", "weights": [5, 4, 6, 5, 5], "variant": 1, "flipRows": True},
    {"tier": 1, "style": "row-snake", "weights": [3, 5, 4, 6, 7], "variant": 2, "flipCols": True},
    {"tier": 2, "style": "column-snake", "weights": [6, 5, 4, 7, 3], "variant": 0},
    {"tier": 2, "style": "row-snake", "weights": [5, 3, 6, 4, 7], "variant": 1, "flipRows": True},
    {"tier": 2, "style": "column-snake", "weights": [4, 7, 5, 3, 6], "variant": 2, "flipCols": True},
    {"tier": 2, "style": "row-snake", "weights": [3, 4, 5, 6, 7], "variant": 3, "reversePath": True},
    {"tier": 3, "style": "column-snake", "weights": [7, 4, 5, 6, 3], "variant": 1, "flipRows": True, "reversePath": True},
    {"tier": 3, "style": "row-snake", "weights": [4, 6, 3, 7, 5], "variant": 2, "flipCols": True},
    {"tier": 3, "style": "column-snake", "weights": [5, 5, 4, 6, 5], "variant": 3},
    {"tier": 4, "style": "row-snake", "weights": [6, 4, 5, 3, 7], "variant": 4, "flipRows": True},
    {"tier": 4, "style": "column-snake", "weights": [3, 7, 4, 6, 5], "variant": 2, "flipCols": True},
    {"tier": 4, "style": "row-snake", "weights": [5, 4, 7, 3, 6], "variant": 1, "reversePath": True},
    {"tier": 5, "style": "column-snake", "weights": [6, 3, 5, 7, 4], "variant": 0, "flipRows": True, "flipCols": True},
    {"tier": 5, "style": "row-snake", "weights": [4, 7, 3, 6, 5], "variant": 2, "flipRows": True, "reversePath": True},
    {"tier": 5, "style": "column-snake", "weights": [5, 6, 4, 3, 7], "variant": 1, "flipCols": True, "reversePath": True},
]


@dataclass
class Puzzle:
    id: str
    size: int
    tier: int
    endpoints: list[dict]
    solution: list[dict]


def build_snake_path(size: int, orientation: str) -> list[tuple[int, int]]:
    path: list[tuple[int, int]] = []

    if orientation == "vertical":
        for column in range(size):
            rows = range(size) if column % 2 == 0 else range(size - 1, -1, -1)
            for row in rows:
                path.append((row, column))
        return path

    for row in range(size):
        columns = range(size) if row % 2 == 0 else range(size - 1, -1, -1)
        for column in columns:
            path.append((row, column))

    return path


def build_traversal(size: int, style: str) -> list[tuple[int, int]]:
    if style == "column-snake":
        return build_snake_path(size, "vertical")
    return build_snake_path(size, "horizontal")


def make_segment_lengths(total_cells: int, weights: list[int], variant: int) -> list[int]:
    count = len(weights)
    minimum = 3 if total_cells >= count * 3 else 2
    lengths = [minimum] * count
    remaining = total_cells - count * minimum
    total_weight = sum(weights)
    used = 0

    for index, weight in enumerate(weights):
        extra = (remaining * weight) // total_weight
        lengths[index] += extra
        used += extra

    leftover = remaining - used
    offset = variant % count
    while leftover > 0:
        lengths[offset] += 1
        leftover -= 1
        offset = (offset + 1) % count

    if variant % 2 == 1:
        lengths.reverse()

    return lengths


def split_traversal(path: list[tuple[int, int]], lengths: list[int]) -> list[list[tuple[int, int]]]:
    segments: list[list[tuple[int, int]]] = []
    cursor = 0
    for length in lengths:
        segments.append(path[cursor : cursor + length])
        cursor += length
    return segments


def weights_for_size(spec: dict, size: int) -> list[int]:
    weights = list(spec["weights"])
    if size <= 5 and len(weights) > 4:
        merge_index = 0
        smallest_pair = weights[0] + weights[1]
        for index in range(1, len(weights) - 1):
            pair_weight = weights[index] + weights[index + 1]
            if pair_weight < smallest_pair:
                smallest_pair = pair_weight
                merge_index = index
        weights[merge_index] += weights[merge_index + 1]
        del weights[merge_index + 1]
    return weights


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
    traversal = transform_path(build_traversal(size, spec["style"]), size, spec)
    lengths = make_segment_lengths(size * size, weights_for_size(spec, size), spec.get("variant", 0))
    solution = [
        {"color": color, "path": path}
        for color, path in enumerate(split_traversal(traversal, lengths))
    ]

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


def is_border_cell(cell: tuple[int, int], size: int) -> bool:
    return cell[0] == 0 or cell[1] == 0 or cell[0] == size - 1 or cell[1] == size - 1


def count_turns(path: list[tuple[int, int]]) -> int:
    turns = 0
    for index in range(2, len(path)):
        dr1 = path[index - 1][0] - path[index - 2][0]
        dc1 = path[index - 1][1] - path[index - 2][1]
        dr2 = path[index][0] - path[index - 1][0]
        dc2 = path[index][1] - path[index - 1][1]
        if dr1 != dr2 or dc1 != dc2:
            turns += 1
    return turns


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

    turn_counts = [count_turns(entry["path"]) for entry in puzzle.solution]
    turning_paths = sum(1 for turns in turn_counts if turns > 0)
    interior_endpoints = sum(
        0 if is_border_cell(endpoint[cell_name], puzzle.size) else 1
        for endpoint in puzzle.endpoints
        for cell_name in ("a", "b")
    )
    total_turns = sum(turn_counts)

    minimum_turning_paths = max(2, int(len(puzzle.solution) * 0.4)) if puzzle.size <= 5 else max(3, int(len(puzzle.solution) * 0.6))
    minimum_interior_endpoints = 1 if puzzle.size <= 5 else 2
    minimum_turns = max(2, len(puzzle.solution) - 2) if puzzle.size <= 5 else len(puzzle.solution)

    if turning_paths < minimum_turning_paths:
        errors.append("puzzle is too straight-lined")
    if interior_endpoints < minimum_interior_endpoints:
        errors.append("puzzle does not place enough endpoints away from the border")
    if total_turns < minimum_turns:
        errors.append("puzzle does not have enough bends")

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