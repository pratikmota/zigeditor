const std = @import("std");

/// Single pin: tools/zig-wasm/VERSION (not siteConfig).
fn versionValue(comptime key: []const u8) []const u8 {
    const text = @embedFile("VERSION");
    var start: usize = 0;
    while (start < text.len) {
        const nl = std.mem.indexOfScalarPos(u8, text, start, '\n') orelse text.len;
        var line = text[start..nl];
        if (line.len > 0 and line[line.len - 1] == '\r') line = line[0 .. line.len - 1];
        if (std.mem.startsWith(u8, line, key) and line.len > key.len and line[key.len] == '=') {
            return line[key.len + 1 ..];
        }
        start = nl + 1;
    }
    @compileError("missing VERSION key: " ++ key);
}

const zig_version = versionValue("zigVersion");
const default_source_rel = ".cache/zig-" ++ zig_version;

pub fn build(b: *std.Build) void {
    // compiler_rt is built here because the self-hosted wasm backend cannot compile it.
    const optimize = b.standardOptimizeOption(.{
        .preferred_optimize_mode = .ReleaseSmall,
    });
    const wasm_target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    });

    // Default extract is gitignored .cache/zig-{ver}/; bump VERSION to get a new folder.
    const zig_source = b.option([]const u8, "zig-source", "Path to unpacked official Zig source (default: .cache/zig-{version})") orelse
        default_source_rel;
    const dist_rel = b.fmt("dist/{s}", .{zig_version});

    const dist_abs = b.pathResolve(&.{ b.build_root.path orelse ".", dist_rel });
    const source_abs = if (std.fs.path.isAbsolute(zig_source))
        zig_source
    else
        b.pathResolve(&.{ b.build_root.path orelse ".", zig_source });
    const cache_abs = b.pathResolve(&.{ b.build_root.path orelse ".", ".zig-cache", "zig-compiler" });
    // Patched copy of official source; never compile zig.wasm from the unmodified tarball extract.
    const vendor_abs = b.pathResolve(&.{ b.build_root.path orelse ".", ".vendor", b.fmt("zig-{s}", .{zig_version}) });
    const patch_dir_abs = b.pathResolve(&.{ b.build_root.path orelse ".", "patches" });
    const fetch_abs = b.pathResolve(&.{ b.build_root.path orelse ".", "fetch-source.sh" });
    const prepare_abs = b.pathResolve(&.{ b.build_root.path orelse ".", "prepare-source.sh" });

    const fetch = b.addSystemCommand(&.{ "sh", fetch_abs });
    fetch.setName("fetch-official-zig-source");
    fetch.has_side_effects = true;

    // dist/{ver}/ is created here so a version bump does not reuse another release's artifacts.
    const mkdir_dist = b.addSystemCommand(&.{ "mkdir", "-p", dist_abs });
    mkdir_dist.has_side_effects = true;

    const prepare = b.addSystemCommand(&.{
        "sh",
        prepare_abs,
        source_abs,
        vendor_abs,
        patch_dir_abs,
        zig_version,
    });
    prepare.setName("prepare-patched-zig-source");
    prepare.has_side_effects = true;
    prepare.step.dependOn(&fetch.step);

    // Nested flags:
    // -Ddev=wasm     reduced compiler (wasm backend + legalize via our patch)
    // -Dno-lib       std is copied from official source into dist/, not baked into zig.wasm
    // threaded IO    default; evented is void on WASI
    const compile_zig = b.addSystemCommand(&.{
        "zig",
        "build",
        "-Dtarget=wasm32-wasi",
        "--release=small",
        "-Ddev=wasm",
        "-Dno-lib",
    });
    compile_zig.addArg(b.fmt("-Dversion-string={s}", .{zig_version}));
    compile_zig.setName("compile-official-zig-to-wasm");
    compile_zig.setCwd(.{ .cwd_relative = vendor_abs });
    compile_zig.addArg("--cache-dir");
    compile_zig.addArg(cache_abs);
    compile_zig.addArg("-p");
    compile_zig.addArg(dist_abs);
    compile_zig.addArg("--prefix-exe-dir");
    compile_zig.addArg(".");
    compile_zig.step.dependOn(&mkdir_dist.step);
    compile_zig.step.dependOn(&prepare.step);
    compile_zig.has_side_effects = true;

    // Guest compiler expects std under WASI preopen /lib; copy from official source, not vendor.
    const copy_lib = b.addSystemCommand(&.{ "rm", "-rf", b.pathJoin(&.{ dist_abs, "lib" }) });
    copy_lib.step.dependOn(&compile_zig.step);
    const copy_lib2 = b.addSystemCommand(&.{
        "cp",
        "-R",
        b.pathJoin(&.{ source_abs, "lib" }),
        b.pathJoin(&.{ dist_abs, "lib" }),
    });
    copy_lib2.step.dependOn(&copy_lib.step);

    const copy_license = b.addSystemCommand(&.{
        "cp",
        b.pathJoin(&.{ source_abs, "LICENSE" }),
        b.pathJoin(&.{ dist_abs, "LICENSE" }),
    });
    copy_license.step.dependOn(&mkdir_dist.step);

    // MIT requires the Zig copyright notice to travel with redistributed compiler artifacts.
    const copy_notice = b.addSystemCommand(&.{
        "cp",
        b.pathResolve(&.{ b.build_root.path orelse ".", "NOTICE" }),
        b.pathJoin(&.{ dist_abs, "NOTICE" }),
    });
    copy_notice.step.dependOn(&mkdir_dist.step);

    copy_lib.has_side_effects = true;
    copy_lib2.has_side_effects = true;
    copy_license.has_side_effects = true;
    copy_notice.has_side_effects = true;

    const compiler_rt = b.addLibrary(.{
        .name = "compiler_rt",
        .linkage = .static,
        .root_module = b.createModule(.{
            .root_source_file = .{ .cwd_relative = b.pathJoin(&.{ source_abs, "lib", "compiler_rt.zig" }) },
            .target = wasm_target,
            .optimize = optimize,
            .single_threaded = true,
        }),
    });
    compiler_rt.root_module.strip = true;

    const install_rt = b.addInstallArtifact(compiler_rt, .{
        .dest_dir = .{ .override = .{ .custom = dist_rel } },
    });
    install_rt.step.dependOn(&fetch.step);

    // zig build names the WASI binary "zig"; the spike and later /wasm/ host expect zig.wasm.
    const rename_exe = b.addSystemCommand(&.{
        "sh",
        "-c",
        b.fmt(
            "if [ -f {s}/zig ]; then mv {s}/zig {s}/zig.wasm; elif [ -f {s}/zig.wasm ]; then :; else echo 'error: zig wasm binary missing' >&2; ls -la {s}; exit 1; fi",
            .{ dist_abs, dist_abs, dist_abs, dist_abs, dist_abs },
        ),
    });
    const copy_crt = b.addSystemCommand(&.{
        "cp",
        b.pathResolve(&.{ b.build_root.path orelse ".", "zig-out", dist_rel, "libcompiler_rt.a" }),
        b.pathJoin(&.{ dist_abs, "libcompiler_rt.a" }),
    });
    copy_crt.step.dependOn(&install_rt.step);
    copy_crt.has_side_effects = true;

    rename_exe.step.dependOn(&compile_zig.step);
    rename_exe.has_side_effects = true;

    const all = b.getInstallStep();
    all.dependOn(&compile_zig.step);
    all.dependOn(&copy_lib2.step);
    all.dependOn(&copy_license.step);
    all.dependOn(&copy_notice.step);
    all.dependOn(&install_rt.step);
    all.dependOn(&copy_crt.step);
    all.dependOn(&rename_exe.step);
}
