# Security notes

See the repository-level [security policy](../../../SECURITY.md) and the [adapter security and failure behavior](README.md#security-and-failure-behavior).

Report findings privately to the repository owner. Do not place credentials, customer content, raw memory responses, or model transcripts in GitHub issues or pull requests.

Key review areas include authenticated scope resolution, provider/tool prompt injection, route body and rate limits, explicit write authorization, streaming cancellation, and redaction of application logs.
