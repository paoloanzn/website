def place_newlines(file_path: str, marker: str = "!b") -> None:
    with open(file_path, "r") as f:
        text = f.read()
    with open(file_path, "w") as f:
        f.write(text.replace(marker, "\n"))


if __name__ == "__main__":
    import argparse, sys
    parser = argparse.ArgumentParser()
    parser.add_argument("file_path", help="Path to the file to process", required=True)
    parser.add_argument("--marker", type=str, default="!b", help="Marker to replace with newlines")
    args = parser.parse_args()
    if args.marker == "":
        place_newlines(args.file_path)
        sys.exit(0)
    place_newlines(args.file_path, args.marker)
    sys.exit(0) 