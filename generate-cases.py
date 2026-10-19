from pathlib import Path

candidates = Path("candidates")
candidates.mkdir(exist_ok=True)


def readcandidates(count):
    name = f"scale_{count:04d}"
    last_function = f"f{count - 1:05d}"

    humal = []
    coffee = []
    typescript = []
    imba = []

    for i in range(count):
        fn = f"f{i:05d}"

        humal.extend([
            f"fn {fn}(x)",
            "    return x + 1",
            ""
        ])

        coffee.extend([
            f"{fn} = (x) ->",
            "  return x + 1",
            ""
        ])

        typescript.extend([
            f"function {fn}(x: number): number {{",
            "    return x + 1;",
            "}",
            ""
        ])

        imba.extend([
            f"def {fn} x",
            "\treturn x + 1",
            ""
        ])

    humal.extend([f"print {last_function}(14)", ""])
    coffee.extend([f"console.log {last_function}(14)", ""])
    typescript.extend([f"console.log({last_function}(14));", ""])
    imba.extend([f"console.log {last_function}(14)", ""])

    files = {
        "hum": "\n".join(humal),
        "coffee": "\n".join(coffee),
        "ts": "\n".join(typescript),
        "civet": "\n".join(typescript),
        "imba": "\n".join(imba),
    }

    for extension, content in files.items():
        path = candidates / f"{name}.{extension}"
        path.write_text(content, encoding="utf-8")

    print(f"Created {name}: {count:,} functions")

    for extension in files:
        path = candidates / f"{name}.{extension}"
        print(f"  {path}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    for count in (100, 1000, 5000):
        readcandidates(count)

    print("\nAll benchmark candidates generated.")
