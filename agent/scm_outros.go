//go:build !windows

package main

// Fora do Windows não há SCM: o driver "scm" responde indisponível.
func novoSCMReal() scmAPI { return nil }

// servicosDisponiveis: só o Windows informa (no Linux o painel pede a unidade systemd).
func servicosDisponiveis() []map[string]string { return nil }
