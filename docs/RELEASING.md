# Prepare a public release

The repository remains private during development. This checklist does not
authorize publication, a release tag or a marketplace submission.

The product consists of two native Omarchy plugins and a local voice service.
The current Python installer installs all three parts.
The audio dependencies and OpenClaw package are installed separately.

## Before publication

1. Consolidate the tested implementation in the private repository.
2. Run the offline checks from [CONTRIBUTING.md](../CONTRIBUTING.md) on Linux.
3. Check installation, upgrade, removal and backup restoration in isolated user directories.
4. Check the QML components with synthetic state on Omarchy.
5. Confirm live start, stop, approval and cancellation on the intended release.
6. Update [compatibility](COMPATIBILITY.md) with the exact supported OpenClaw release and limits.
7. Review tracked files and history for private data with the publication checker.
8. Preserve [credits](../CREDITS.md) and all distributed licence notices.
9. Update package and plugin versions together before creating a release tag.
10. Obtain the owner's decision before making the repository public.

Automated tests must not open physical audio devices or contact a live provider.
Keep screenshots, recordings, transcripts and private configuration out of the repository.
An isolated installer test with mocked service commands does not prove real service-manager installation or removal.
Record that limit until a clean Omarchy installation test covers those steps.

## Marketplace packaging remains separate

The current manifests are inside `plugin/`, with shared code beside both plugin directories.
The marketplace currently requires a public repository with a valid root manifest.
Do not advertise `omarchy plugin add` as a complete installer for this layout.

Before submission, choose a supported layout that includes shared code and the
service setup without duplicating them. Validate dependency installation, plugin
discovery, disable/re-enable, shell restart and removal through that distribution path.
Keep installation instructions explicit about the local service and OpenClaw requirements.

References: [Omarchy shell](https://github.com/omacom/omarchy/blob/quattro/shell/README.md)
and [marketplace publishing](https://plugins.omarchy.org/publish.html).
