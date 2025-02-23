import assert from "assert"

import core from "@actions/core"

import Tool from "./tool.js"

export default class Python extends Tool {
    static tool = "python"
    static envVar = "PYENV_ROOT"
    static envPaths = ["bin", "shims", "plugins/pyenv-virtualenv/shims"]
    static installer = "pyenv"

    constructor() {
        super(Python.tool)
    }

    async setup(desiredVersion) {
        const [checkVersion, isVersionOverridden] = this.getVersion(
            desiredVersion,
            ".python-version",
        )
        if (!(await this.haveVersion(checkVersion))) {
            return checkVersion
        }

        // Check if pyenv exists and can be run, and capture the version info while
        // we're at it
        await this.findInstaller()

        // Ensure we have the latest pyenv and python versions available
        await this.updatePyenv()

        // Set downstream environment variable for future steps in this Job
        if (isVersionOverridden) {
            core.exportVariable("PYENV_VERSION", checkVersion)
        }

        // using -s option to skip the install and become a no-op if the
        // version requested to be installed is already installed according to pyenv.
        let installCommand = `pyenv install -s`
        // pyenv install does not pick up the environment variable PYENV_VERSION
        // unlike tfenv, so we specify it here as an argument explicitly, if it's set
        if (isVersionOverridden) installCommand += ` ${checkVersion}`

        await this.subprocessShell(installCommand).catch(
            this.logAndExit(`failed to install python version ${checkVersion}`),
        )

        // Sanity check the python command works, and output its version
        await this.validateVersion(checkVersion)

        // Sanity check the pip command works, and output its version
        await this.version("pip --version")

        // If we got this far, we have successfully configured python.
        core.setOutput(Python.tool, checkVersion)
        this.info("python success!")
        return checkVersion
    }

    /**
     * Update pyenv via the 'pyenv update' plugin command, if it's available.
     */
    async updatePyenv() {
        // Extract PYENV_VERSION to stop it complaining
        // eslint-disable-next-line no-unused-vars
        const { PYENV_VERSION, ...env } = process.env
        const cmd = `${this.installer} update`
        await this.subprocessShell(cmd, {
            // Run outside the repo root so we don't pick up defined version files
            cwd: process.env.RUNNER_TEMP,
            env: { ...env, ...this.getEnv() },
        }).catch((err) => {
            this.warning(
                `Failed to update pyenv, latest versions may not be supported`,
            )
            if (err.stderr) {
                this.debug(err.stderr)
            }
        })
    }

    async setEnv() {
        core.exportVariable("PYENV_VIRTUALENV_INIT", 1)
        return super.setEnv()
    }

    /**
     * Download and configures pyenv.
     *
     * @param  {string} root - Directory to install pyenv into (PYENV_ROOT).
     * @return {string} The value of PYENV_ROOT.
     */
    async install(root) {
        assert(root, "root is required")
        const gh = `https://${process.env.GITHUB_SERVER || "github.com"}/pyenv`
        const url = `${gh}/pyenv/archive/refs/heads/master.tar.gz`

        root = await this.downloadTool(url, { dest: root, strip: 1 })
        this.info(`Downloaded pyenv to ${root}`)

        return root
    }
}

// Register the subclass in our tool list
Python.register()
