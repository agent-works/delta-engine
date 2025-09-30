# File Organizer

An intelligent file organization assistant that helps clean up and structure your directories automatically.

## Features
- 📁 Organizes files by type, date, or size
- 🔍 Detects and handles duplicate files
- 📊 Generates organization reports
- 🗂️ Creates logical folder structures
- ⚠️ Safe operations with user confirmation

## Usage

```bash
# Basic organization by file type
delta run --agent examples/file-organizer --task "Organize all files in this directory by type"

# Archive old files
delta run --agent examples/file-organizer --task "Archive files older than 30 days"

# Find and handle duplicates
delta run --agent examples/file-organizer --task "Find duplicate files and suggest what to do"

# Interactive mode - asks before moving files
delta run -i --agent examples/file-organizer --task "Organize my downloads folder safely"

# Custom organization
delta run -i --agent examples/file-organizer --task "Help me create a custom organization structure"
```

## Organization Strategies

### By Type
```
./
├── documents/     # PDFs, Word docs, text files
├── images/        # JPG, PNG, GIF, SVG
├── videos/        # MP4, AVI, MOV
├── code/          # Source code files
├── archives/      # ZIP, TAR, compressed files
└── data/          # CSV, JSON, XML
```

### By Date
```
./
├── archive/
│   ├── 2024/
│   └── 2023/
├── recent/        # Modified within 7 days
└── old-files/     # Not modified in 30+ days
```

### By Project
```
./
├── project-alpha/
├── project-beta/
└── misc/
```

## Safety Features

- ✅ Always asks confirmation before moving files
- ✅ Never deletes files without explicit permission
- ✅ Creates organization report before and after
- ✅ Preserves original filenames
- ✅ Can create backups before major changes

## Example Report

```
FILE ORGANIZATION REPORT
========================
Date: 2024-01-15
Total files processed: 127

Organized by type:
- Documents: 45 files → documents/
- Images: 32 files → images/
- Code: 28 files → code/
- Archives: 12 files → archives/
- Data: 10 files → data/

Duplicates found: 8
Space saved: 156 MB

Recommendations:
- Regular cleanup of downloads folder
- Consider cloud backup for important documents
- Archive projects older than 6 months
```