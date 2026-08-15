# Security policy

Report security issues privately to the repository owner rather than opening a public exploit report.

The SDK sanitizes upstream HTML, but operators must still apply their own Content Security Policy and should render only `chapter.content.html`, never `chapter.content.raw`. Source permissions and access controls are outside the SDK.
